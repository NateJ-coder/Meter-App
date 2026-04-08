Attribute VB_Name = "D_BreakDown_Electricity"

Sub CreateBuildingReport()
    Report_Date = SelDate
End Sub

Sub GenerateElectricityBreakDown()

   ' Debug.Print "GenerateElectricityBreakDown ------- ###" & Timer - StartTime
   
    Sheets("ElecBreakDown").Activate
    With Sheets("ElecBreakDown")
    
    ' Clears the breakdown of all data *********************
        .Range("A3:AZ238").ClearContents
        .Range("A3:AZ238").Interior.Pattern = xlSolid
        
        CalcTotalforActualUnitElecIncome
        CalcSharedAmounts
        
   '  MUST HAVE TOTALS BEFORE THIS LIVE CAN BE DISPLAYED
'        ElecActualTotCharge = ElecActualTariffC1 + ElecActualTariffC2 + ElecActualTariffC3 + ElecActualTariffC4 + ElecActualTariffC5
'        ElecDifference = ElecBulkTotCharge - ElecActualTotCharge
'
    ' Building Name and Dates *********************
        .Cells(1, 5) = BuildingName
        .Cells(3, 5) = "TIERED TARIFFS"
        
'#4-------------------------------------------------------------------------
        .Cells(4, 2) = "Previous Reading " & PrevDate
        .Cells(4, 3) = "Selected Date " & SelDate
        .Cells(4, 4) = "Kw Used"
     
        ERange1 = "0 < " & EQ1
        ERange2 = EQ1 & " < " & EQ2
        ERange3 = EQ2 & " < " & EQ3
        ERange4 = EQ3 & " < " & EQ4
        
        ERange5 = EQ4 & " < " & EQ5
        ERange6 = EQ5 & " < " & EQ6
        ERange7 = EQ6 & " < " & EQ7
        ERange8 = EQ7 & " < " & EQ8
      
    ' Show Selected Tiered Tariff Table *********************
      .Cells(4, 5) = ERange1 & vbCrLf & " kWh"
      .Cells(4, 6) = ET1
      .Cells(4, 7) = ERange2 & vbCrLf & " kWh"
      .Cells(4, 8) = ET2
      .Cells(4, 9) = ERange3 & vbCrLf & " kWh"
      .Cells(4, 10) = ET3
      .Cells(4, 11) = ERange4 & vbCrLf & " kWh"
      .Cells(4, 12) = ET4
      .Cells(4, 13) = ERange5 & vbCrLf & " kWh"
      .Cells(4, 14) = ET5
      
      .Cells(4, 15) = "Totals"
    
      ' .Cells(4, 16) = "Difference between BULK and UNIT Totals"
      .Cells(4, 16) = "Bulk Total, less Actual Income"
           '  Electric Total Heading
      .Cells(4, 17) = OptionText1 & ": (" & OptionChoice1 & ")"
      .Cells(4, 18) = OptionText2 & ": (" & OptionChoice2 & ")"
      .Cells(4, 19) = OptionText3 & ": (" & OptionChoice3 & ")"
      .Cells(4, 20) = "GRAND TOTAL"
      
      .Cells(4, 23) = OptionText7 & ": (" & OptionChoice7 & ")"
      .Cells(4, 26) = OptionText8 & ": (" & OptionChoice8 & ")"
     
'#5------------------------------------------------------------------------
        .Cells(5, 3) = "Bulk Total"
        .Cells(5, 4) = ElecBulkTotCon
         
        .Cells(5, 15) = ElecBulkTotCharge ' Elect Charge * MUST GO FIRST
        
        .Cells(5, 5) = ElecBulkTariffU1
        .Cells(5, 6) = ElecBulkTariffC1
        .Cells(5, 7) = ElecBulkTariffU2
        .Cells(5, 8) = ElecBulkTariffC2
        .Cells(5, 9) = ElecBulkTariffU3
        .Cells(5, 10) = ElecBulkTariffC3
        .Cells(5, 11) = ElecBulkTariffU4
        .Cells(5, 12) = ElecBulkTariffC4
        .Cells(5, 13) = ElecBulkTariffU5
        .Cells(5, 14) = ElecBulkTariffC5
         
        If IgnoreNegComP = True And ElecDifference <= 0 Then
            .Cells(5, 16) = "(" & RemElecDiff & ") " & "Ignored"
        Else
            .Cells(5, 16) = ElecDifference
        End If
        
        .Cells(5, 17) = OptionAmount1
     
'#6------------------------------------------------------------------------
       
        ' .Cells(6, 3) = "Units Total"
        .Cells(6, 3) = "Estimate Muni. Charge"
        
        .Cells(6, 4) = ElecUnitTotCon
     
        .Cells(6, 15) = ElecUnitTotCharge ' Elect Charge * MUST GO FIRST
      
        .Cells(6, 5) = ElecUnitTariffU1
        .Cells(6, 6) = ElecUnitTariffC1
        .Cells(6, 7) = ElecUnitTariffU2
        .Cells(6, 8) = ElecUnitTariffC2
        .Cells(6, 9) = ElecUnitTariffU3
        .Cells(6, 10) = ElecUnitTariffC3
        .Cells(6, 11) = ElecUnitTariffU4
        .Cells(6, 12) = ElecUnitTariffC4
        .Cells(6, 13) = ElecUnitTariffU5
        .Cells(6, 14) = ElecUnitTariffC5
        
        .Cells(6, 17) = ElecDifference
        
        .Cells(6, 20) = "Excl VAT"
        .Cells(6, 21) = "Incl VAT"
        
       '# PREPAID ------------------------------------------------------------------------
        .Cells(6, 29) = PPElecConvMeterTotal
       
'#7------------------------------------------------------------------------

        .Cells(7, 4) = "Actual Income from Unit Charges >"
        .Cells(7, 15) = ElecActualTotCharge ' Elect Charge * MUST GO FIRST
 
        .Cells(7, 5) = ElecActualTariffU1
        .Cells(7, 6) = ElecActualTariffC1
        .Cells(7, 7) = ElecActualTariffU2
        .Cells(7, 8) = ElecActualTariffC2
        .Cells(7, 9) = ElecActualTariffU3
        .Cells(7, 10) = ElecActualTariffC3
        .Cells(7, 11) = ElecActualTariffU4
        .Cells(7, 12) = ElecActualTariffC4
        .Cells(7, 13) = ElecActualTariffU5
        .Cells(7, 14) = ElecActualTariffC5
        
        .Cells(7, 16) = "PQ Values"
       
        .Cells(7, 17) = ElecDifference + OptionAmount1
     
        .Cells(7, 18) = OptionAmount2
        .Cells(7, 19) = OptionAmount3
 
 '# SANITATION and REFUSE ------------------------------------------------------------------------
        .Cells(5, 23) = ChrW(931) & " R" & Format(SanTot, "0.00") ' Show SUM (SIGMA) of Sanitation
        
        .Cells(6, 23) = OptionAmount7
         .Cells(6, 26) = OptionAmount8
        
        .Cells(7, 23) = "Excl VAT"
         .Cells(7, 24) = "Incl VAT"
        
        .Cells(7, 26) = "Excl VAT"
         .Cells(7, 27) = "Incl VAT"
        
        .Cells(6, 30) = "Excl VAT"
        .Cells(7, 30) = "Incl VAT"

  '# EACH UNIT ------------------------------------------------------------------------
 'James   CalcSharedAmounts
    
    PPNoOfElecInstalled = 0
    PrepaidElecTotal = 0
    StartOffset = 8
    
    For i = 1 To ElecUnitCount
        PQ = PercentageQuotes(i)
        
        .Cells(i + StartOffset, 1) = UnitNames(i) ' Unit name
        .Cells(i + StartOffset, 2) = ElecPrevReadings(i) ' Prev Reading
        .Cells(i + StartOffset, 3) = ElecThisReadings(i) ' Selected Reading
        .Cells(i + StartOffset, 4) = ElecUnitCons(i) ' Con-sumption
        
        ' Break down of tiered electricity charges PER UNIT ------------------------------------
        If NewCalc = True Then  ' ##########################
            ThisUnitsElec = GetElecCostsNew(ElecUnitCons(i), 1)
        Else
            ThisUnitsElec = GetElecCosts(ElecUnitCons(i), 1)
        End If
'        ThisUnitsElec = GetElecCostsNew(ElecUnitCons(i), 1) ' PERFORMS THE CALCULATION SPLIT - MUST GO FIRST
        
        .Cells(i + StartOffset, 5) = ElecTariffUnits1
        .Cells(i + StartOffset, 6) = ElecTariffCost1
        .Cells(i + StartOffset, 7) = ElecTariffUnits2
        .Cells(i + StartOffset, 8) = ElecTariffCost2
        .Cells(i + StartOffset, 9) = ElecTariffUnits3
        .Cells(i + StartOffset, 10) = ElecTariffCost3
        
        .Cells(i + StartOffset, 11) = ElecTariffUnits4
        .Cells(i + StartOffset, 12) = ElecTariffCost4
        .Cells(i + StartOffset, 13) = ElecTariffUnits5
        .Cells(i + StartOffset, 14) = ElecTariffCost5
        
        .Cells(i + StartOffset, 15) = ThisUnitsElec   ' This Unit's Total Electric Cost
        
        '-------------------------------------------------------------------------------
        PQ = PercentageQuotes(i)
        .Cells(i + StartOffset, 16) = Format(PQ, "0.00") & "%"
        
        '' ''
        .Cells(i + StartOffset, 17) = ElecBulkDiff(i)
        .Cells(i + StartOffset, 18) = OptionCharge2(i)
        .Cells(i + StartOffset, 19) = OptionCharge3(i)
           
        ' *********************************************************************************************
  
        TotalElecCost = ThisUnitsElec + ElecBulkDiff(i) + OptionCharge2(i) + OptionCharge3(i)
            .Cells(i + StartOffset, 20) = TotalElecCost
        
        TotalElecCostInclVat = TotalElecCost * (1 + VatPercent)
            .Cells(i + StartOffset, 21) = TotalElecCostInclVat
        
        ' ################### SANITATION AND REFUSE #########################
        '####################################################################
       
        .Cells(i + StartOffset, 23) = OptionCharge7(i)
         InclVat = OptionCharge7(i) * (1 + VatPercent)
        .Cells(i + StartOffset, 24) = InclVat
        
        '####################################################################
        '####################################################################
         
        .Cells(i + StartOffset, 26) = OptionCharge8(i)
        InclVat = OptionCharge8(i) * (1 + VatPercent)
        .Cells(i + StartOffset, 27) = InclVat
        
        ' PREPAID
        If PrepaidElecInstalled(i) > 0 Then ' And PrepaidElecInstalled(I) < ElecThisReadings(I) Then
            PPNoOfElecInstalled = PPNoOfElecInstalled + 1
            .Range(Cells(i + StartOffset, 1), Cells(i + StartOffset, 1)).Interior.Pattern = xlGray50
            .Cells(i + StartOffset, 29) = ElecUnitCons(i)
            PPElecConvMeterTotal = PPElecConvMeterTotal + ElecUnitCons(i)
        End If
       
     Next
    
    .Cells(4, 29) = PPNoOfElecInstalled & "/" & ElecUnitCount & " Units" & vbLf _
        & "have Prepaid Meters" & vbLf _
        & "which used " & vbLf & PPElecConvMeterTotal & "Kw"
    
     If NewCalc = True Then  ' ##########################
        PPTotalElecCost = GetElecCostsNew(PPElecConvMeterTotal, PPNoOfElecInstalled)
    Else
        PPTotalElecCost = GetElecCosts(PPElecConvMeterTotal, PPNoOfElecInstalled)
    End If
    
    .Cells(6, 29) = PPTotalElecCost
    PPTotalElecCostInclVat = PPTotalElecCost * (1 + VatPercent)
    .Cells(7, 29) = PPTotalElecCostInclVat
      
   End With
 
End Sub

Sub CalcTotalforActualUnitElecIncome()
      
        ElecActualTariffU1 = 0
        ElecActualTariffC1 = 0
        ElecActualTariffU2 = 0
        ElecActualTariffC2 = 0
        ElecActualTariffU3 = 0
        ElecActualTariffC3 = 0
        ElecActualTariffU4 = 0
        ElecActualTariffC4 = 0
        ElecActualTariffU5 = 0
        ElecActualTariffC5 = 0
    
    Dim ThisElecUnit As Double
    
    For UnitNo = 1 To TotalUnitCount
            If NewCalc = True Then  ' ##########################
        ThisElecUnit = GetElecCostsNew(ElecUnitCons(UnitNo), 1) ' PERFORMS THE CALCULATION SPLIT - MUST GO FIRST
    Else
        ThisElecUnit = GetElecCosts(ElecUnitCons(UnitNo), 1) ' PERFORMS THE CALCULATION SPLIT - MUST GO FIRST
    End If
                
        UnitElecCost(UnitNo) = ThisElecUnit
        ElecActualTariffU1 = ElecActualTariffU1 + ElecTariffUnits1
        ElecActualTariffC1 = ElecActualTariffC1 + ElecTariffCost1
        ElecActualTariffU2 = ElecActualTariffU2 + ElecTariffUnits2
        ElecActualTariffC2 = ElecActualTariffC2 + ElecTariffCost2
        ElecActualTariffU3 = ElecActualTariffU3 + ElecTariffUnits3
        ElecActualTariffC3 = ElecActualTariffC3 + ElecTariffCost3
        ElecActualTariffU4 = ElecActualTariffU4 + ElecTariffUnits4
        ElecActualTariffC4 = ElecActualTariffC4 + ElecTariffCost4
        ElecActualTariffU5 = ElecActualTariffU5 + ElecTariffUnits5
        ElecActualTariffC5 = ElecActualTariffC5 + ElecTariffCost5
        
        ' ***********************************
        
    Next
    
        ElecActualTotCharge = ElecActualTariffC1 + ElecActualTariffC2 + ElecActualTariffC3 + ElecActualTariffC4 + ElecActualTariffC5
        ElecDifference = ElecBulkTotCharge - ElecActualTotCharge
        
        RemElecDiff = Format(ElecDifference, "#.00")
        If IgnoreNegComP = True Then If ElecDifference < 0 Then ElecDifference = 0
        
End Sub
